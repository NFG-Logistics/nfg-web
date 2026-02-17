"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Download, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import type { Document, DocumentType } from "@/types";

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  bol: "Bill of Lading",
  rate_confirmation: "Rate Confirmation",
  lumper_receipt: "Lumper Receipt",
  scale_ticket: "Scale Ticket",
  cargo_photo: "Cargo Photo",
  other: "Other",
};

const DOC_TYPE_VARIANT: Record<DocumentType, "default" | "secondary" | "info" | "warning" | "success"> = {
  bol: "default",
  rate_confirmation: "info",
  lumper_receipt: "warning",
  scale_ticket: "secondary",
  cargo_photo: "success",
  other: "secondary",
};

interface DocumentWithRelations extends Document {
  load?: { reference_number: string };
  uploader?: { full_name: string };
}

export default function DocumentsPage() {
  const supabase = createClient();
  const [documents, setDocuments] = useState<DocumentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchDocs() {
      try {
        const { data, error } = await supabase
          .from("documents")
          .select("*, load:load_id(reference_number), uploader:uploaded_by(full_name)")
          .order("created_at", { ascending: false });
        if (error) console.error("Failed to fetch documents:", error);
        setDocuments((data as any) || []);
      } catch (err) {
        console.error("Documents fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDocs();
  }, []);

  const filtered = documents.filter((d) => {
    const matchesSearch =
      (d.load as any)?.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      d.file_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.uploader as any)?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || d.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" description={`${documents.length} documents on file`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No documents found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[200px]">{doc.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{(doc.load as any)?.reference_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={DOC_TYPE_VARIANT[doc.type as DocumentType] || "secondary"}>
                        {DOC_TYPE_LABELS[doc.type as DocumentType] || doc.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{(doc.uploader as any)?.full_name || "—"}</TableCell>
                    <TableCell>{format(new Date(doc.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";
import type { OracleNodeRecord } from "@/lib/types";
import { formatUsdc } from "@/lib/utils";

export default function OracleActivityPage() {
  const [nodes, setNodes] = useState<OracleNodeRecord[]>([]);

  useEffect(() => {
    fetchJson<{ nodes: OracleNodeRecord[] }>("/api/oracle/active-nodes")
      .then((r) => setNodes(r.nodes))
      .catch(() => setNodes([]));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oracle Network"
        title="Active oracles"
        description="Live list of oracle nodes currently registered on the VISTA registry. The SDK fans heartbeats out across this set."
      />
      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Registered nodes
          </CardTitle>
          <CardDescription>
            {nodes.length} active oracle{nodes.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pubkey</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Stake</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Slashes</TableHead>
                <TableHead>Reputation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((n) => (
                <TableRow key={n.oracle_pubkey}>
                  <TableCell className="font-mono text-xs">
                    {n.oracle_pubkey}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {n.endpoint_url}
                  </TableCell>
                  <TableCell>
                    {formatUsdc(n.stake_amount / 1_000_000)} USDC
                  </TableCell>
                  <TableCell>{n.total_submissions}</TableCell>
                  <TableCell>{n.total_slashes}</TableCell>
                  <TableCell>{n.reputation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

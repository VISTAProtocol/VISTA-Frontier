"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartPoint } from "@/lib/types"

export function MetricChartCard({
  title,
  description,
  data,
  kind = "line",
  primaryLabel = "Value",
  secondaryLabel,
  valueFormatter = (value) => String(value),
}: {
  title: string
  description: string
  data: ChartPoint[]
  kind?: "line" | "bar"
  primaryLabel?: string
  secondaryLabel?: string
  valueFormatter?: (value: number) => string
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                }}
                formatter={(value, name) => [
                  valueFormatter(Number(Array.isArray(value) ? value[0] : value ?? 0)),
                  name,
                ]}
              />
              <Bar dataKey="value" fill="var(--chart-1)" name={primaryLabel} radius={[10, 10, 0, 0]} />
              {secondaryLabel ? (
                <Bar dataKey="secondaryValue" fill="var(--chart-2)" name={secondaryLabel} radius={[10, 10, 0, 0]} />
              ) : null}
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                }}
                formatter={(value, name) => [
                  valueFormatter(Number(Array.isArray(value) ? value[0] : value ?? 0)),
                  name,
                ]}
              />
              <Line
                dataKey="value"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={3}
                dot={false}
                name={primaryLabel}
              />
              {secondaryLabel ? (
                <Line
                  dataKey="secondaryValue"
                  type="monotone"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  name={secondaryLabel}
                />
              ) : null}
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

"use client";
import { tr } from "@/lib/tr";
import { useState } from "react";
import { TaskCommentsPanel } from "@/components/p2-panels";
import { ResourcePage } from "@/components/resource-page";
import { PageHeader, Tabs } from "@/components/ui";

export default function Tasks() {
  const [tab, setTab] = useState("list");
  return (
    <>
      <PageHeader label={tr("Management")} title={tr("Tugas & Tim")} desc={tr("Tugas dengan prioritas, tenggat, komentar, dan checklist. Aktivitas dicatat atas nama perangkat/operator.")} />
      <Tabs tabs={[{ key: "list", label: tr("Daftar Tugas") }, { key: "comments", label: tr("Komentar & Checklist") }]} value={tab} onChange={setTab} />
      {tab === "list" ? <ResourcePage resource="tasks" /> : <TaskCommentsPanel />}
    </>
  );
}

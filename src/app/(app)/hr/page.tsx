"use client";
import { tr } from "@/lib/tr";
import { useState } from "react";
import { LeavePanel, PayrollPanel, ShiftPanel } from "@/components/p2-panels";
import { CommissionPanel } from "@/components/prd-panels";
import { ResourcePage } from "@/components/resource-page";
import { PageHeader, Tabs } from "@/components/ui";

export default function Hr() {
  const [tab, setTab] = useState("emp");
  return (
    <>
      <PageHeader label={tr("Management")} title={tr("Karyawan & HR")} desc={tr("Catatan karyawan, absensi, cuti, jadwal shift, lembur, dan penggajian (payroll).")} />
      <Tabs tabs={[{ key: "emp", label: tr("Karyawan") }, { key: "att", label: tr("Absensi") }, { key: "leave", label: tr("Cuti & Izin") }, { key: "shift", label: tr("Shift & Lembur") }, { key: "payroll", label: tr("Payroll") }, { key: "comm", label: tr("Komisi") }]} value={tab} onChange={setTab} />
      {tab === "emp" && <ResourcePage resource="employees" />}
      {tab === "att" && <ResourcePage resource="attendance" hint={tr("Catat kehadiran per karyawan per tanggal.")} />}
      {tab === "leave" && <LeavePanel />}
      {tab === "shift" && <ShiftPanel />}
      {tab === "payroll" && <PayrollPanel />}
      {tab === "comm" && <CommissionPanel />}
    </>
  );
}

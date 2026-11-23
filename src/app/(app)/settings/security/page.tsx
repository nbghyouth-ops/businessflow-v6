import { SecurityPanel } from "@/components/security-panel";
import { tr } from "@/lib/tr";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Akun & Keamanan — Business Flow" };

export default function SecurityPage() {
  return (
    <>
      <PageHeader label={tr("Pengaturan")} title={tr("Akun, anggota & keamanan")} desc={tr("Akun Google Anda, sesi aktif, anggota workspace, dan undangan. Kunci perangkat (PIN) terpisah dari akun.")} />
      <SecurityPanel />
    </>
  );
}

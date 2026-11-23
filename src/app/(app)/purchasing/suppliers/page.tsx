"use client";

import { useState } from "react";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, PageHeader, TextArea, TextField } from "@/components/ui";
import { api, toast, useApi } from "@/lib/client";
import { tr } from "@/lib/tr";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

/**
 * Direktori supplier (R11-E) — CATATAN INTERNAL.
 * Tidak memesan barang, tidak menghubungi supplier, dan tidak melakukan pembayaran.
 */
export default function SuppliersPage() {
  const { data, error, loading, reload } = useApi<{ items: Supplier[] }>("/v6/suppliers");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/v6/suppliers", {
        body: { name, phone: phone || null, email: email || null, address: address || null, notes: notes || null },
      });
      setName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNotes("");
      toast(tr("Supplier dicatat"));
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Supplier) {
    try {
      await api(`/v6/suppliers/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } });
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <>
      <PageHeader
        label={tr("Pembelian")}
        title={tr("Direktori Supplier")}
        desc={tr("Catatan internal pemasok: kontak dan catatan. Aplikasi tidak memesan atau membayar apa pun ke supplier.")}
      />
      <Card className="mb-6" title={tr("Tambah supplier")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Nama supplier")} value={name} onChange={setName} />
          <TextField label={tr("Telepon")} value={phone} onChange={setPhone} />
          <TextField label={tr("Email")} value={email} onChange={setEmail} />
          <TextField label={tr("Alamat")} value={address} onChange={setAddress} />
        </div>
        <div className="mt-3">
          <TextArea label={tr("Catatan")} value={notes} onChange={setNotes} />
        </div>
        <div className="mt-3">
          <Button loading={busy} disabled={name.trim().length < 2} onClick={() => void save()}>
            {tr("Simpan supplier")}
          </Button>
        </div>
      </Card>
      <Card title={tr("Daftar supplier")}>
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data?.items ?? []}
            caption={tr("Daftar supplier workspace ini")}
            empty={<Empty title={tr("Belum ada supplier")} hint={tr("Tambahkan pemasok yang benar-benar Anda gunakan.")} />}
            columns={[
              { key: "name", label: tr("Nama") },
              { key: "phone", label: tr("Telepon") },
              { key: "email", label: tr("Email") },
              { key: "notes", label: tr("Catatan") },
              {
                key: "status",
                label: tr("Status"),
                render: (s: Supplier) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? tr("Aktif") : tr("Nonaktif")}</Badge>,
              },
              {
                key: "a",
                label: "",
                render: (s: Supplier) => (
                  <Button variant="secondary" className="!min-h-[34px] !px-3 text-xs" onClick={() => void toggle(s)}>
                    {s.isActive ? tr("Nonaktifkan") : tr("Aktifkan")}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

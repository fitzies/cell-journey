"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

import { PanelLoading } from "./panel-ui";
import type { ServiceRow } from "./types";

function parseSortOrder(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function ServicesPanel({ services }: { services: ServiceRow[] | undefined }) {
  const columns = useMemo<ColumnDef<ServiceRow>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Service" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "sortOrder",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Display order" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.sortOrder}</span>,
    },
    {
      accessorKey: "isActive",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => row.original.isActive
        ? <Badge variant="secondary">Active</Badge>
        : <Badge variant="outline">Archived</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <EditServiceDialog service={row.original} />
        </div>
      ),
    },
  ], []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Active services appear in mobile onboarding in display order. Archived services stay on existing profiles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!services ? (
          <PanelLoading />
        ) : (
          <DataTable columns={columns} data={services} emptyMessage="No services yet. Create one to add it to onboarding." />
        )}
      </CardContent>
    </Card>
  );
}

export function CreateServiceDialog({ services }: { services: ServiceRow[] | undefined }) {
  const createService = useMutation(api.admin.createService);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suggestedSortOrder = (services ?? []).reduce(
    (highest, service) => Math.max(highest, service.sortOrder),
    0,
  ) + 10;
  const parsedSortOrder = parseSortOrder(sortOrder);

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    setError(null);
    if (nextOpen) {
      setName("");
      setSortOrder(String(suggestedSortOrder));
    }
  }

  function submit() {
    if (parsedSortOrder === null) return;
    setError(null);
    startTransition(async () => {
      try {
        await createService({ name, sortOrder: parsedSortOrder });
        setDialogOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create service");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button disabled={!services}><Plus />Create service</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create service</DialogTitle>
          <DialogDescription>The new service will appear in onboarding as soon as you create it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sunday 10am"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="service-order">Display order</Label>
            <Input
              id="service-order"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim() || parsedSortOrder === null}>
            {pending ? "Creating…" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditServiceDialog({ service }: { service: ServiceRow }) {
  const updateService = useMutation(api.admin.updateService);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(service.name);
  const [sortOrder, setSortOrder] = useState(String(service.sortOrder));
  const [status, setStatus] = useState(service.isActive ? "active" : "archived");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsedSortOrder = parseSortOrder(sortOrder);

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    setError(null);
    if (nextOpen) {
      setName(service.name);
      setSortOrder(String(service.sortOrder));
      setStatus(service.isActive ? "active" : "archived");
    }
  }

  function submit() {
    if (parsedSortOrder === null) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateService({
          serviceId: service._id,
          name,
          sortOrder: parsedSortOrder,
          isActive: status === "active",
        });
        setDialogOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update service");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit service</DialogTitle>
          <DialogDescription>Archiving hides this service from onboarding without changing existing profiles.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor={`service-name-${service._id}`}>Name</Label>
            <Input
              id={`service-name-${service._id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`service-order-${service._id}`}>Display order</Label>
            <Input
              id={`service-order-${service._id}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`service-status-${service._id}`}>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id={`service-status-${service._id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim() || parsedSortOrder === null}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

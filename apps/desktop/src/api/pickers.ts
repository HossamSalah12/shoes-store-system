import { apiClient } from './client';
import type { PickerOption } from '../components/AsyncPicker';
import { formatCurrency } from '../utils/currency';

export async function fetchSupplierOptions(query: string): Promise<PickerOption[]> {
  const res = await apiClient.get('/api/suppliers');
  const suppliers: { id: string; name: string; phone: string | null }[] = res.data.data;
  return suppliers
    .filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()))
    .map((s) => ({ id: s.id, label: s.name, sublabel: s.phone ?? undefined }));
}

export async function fetchCustomerOptions(query: string): Promise<PickerOption[]> {
  const res = await apiClient.get('/api/customers', { params: { search: query || undefined } });
  const customers: { id: string; name: string; phone: string | null }[] = res.data.data;
  return customers.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined }));
}

export async function fetchVariantOptions(query: string): Promise<PickerOption[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await apiClient.get('/api/products', { params: { search: query, pageSize: 15 } });
  const products: any[] = res.data.data.items;
  return products.flatMap((p) =>
    p.variants.map((v: any) => ({
      id: v.id,
      label: `${p.name} — ${v.size.label} / ${v.color.name}`,
      sublabel: `SKU: ${v.sku}`,
    })),
  );
}

export async function fetchSaleOptions(query: string): Promise<PickerOption[]> {
  const res = await apiClient.get('/api/sales', { params: { pageSize: 20 } });
  const sales: { id: string; invoiceNumber: string; totalAmount: string; createdAt: string }[] = res.data.data.items;
  return sales
    .filter((s) => !query || s.invoiceNumber.toLowerCase().includes(query.toLowerCase()))
    .map((s) => ({
      id: s.id,
      label: s.invoiceNumber,
      sublabel: `${formatCurrency(Number(s.totalAmount))} — ${new Date(s.createdAt).toLocaleDateString('ar-EG')}`,
    }));
}

/** Sale-item options depend on a chosen sale — fetched separately, not via AsyncPicker's query. */
export async function fetchSaleItems(saleId: string): Promise<PickerOption[]> {
  const res = await apiClient.get(`/api/sales/${saleId}`);
  const sale = res.data.data;
  return sale.items.map((item: any) => ({
    id: item.id,
    label: `${item.variant.product.name} — ${item.variant.size.label} / ${item.variant.color.name}`,
    sublabel: `الكمية المباعة: ${item.quantity}`,
  }));
}

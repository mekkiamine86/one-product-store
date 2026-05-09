import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminAuthorized } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

// POST /api/orders → public, customers create orders
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const {
    customer_name,
    customer_phone,
    customer_address,
    product_name,
    product_price,
  } = body || {};

  if (!customer_name?.trim() || !customer_phone?.trim() || !customer_address?.trim()) {
    return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 });
  }

  if (!product_name || product_price == null) {
    return NextResponse.json({ error: 'بيانات المنتج ناقصة' }, { status: 400 });
  }

  const phone = String(customer_phone).replace(/\s+/g, '');
  if (phone.length < 9) {
    return NextResponse.json({ error: 'رقم الهاتف غير صالح' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('orders')
    .insert({
      customer_name: String(customer_name).trim().slice(0, 200),
      customer_phone: phone.slice(0, 30),
      customer_address: String(customer_address).trim().slice(0, 500),
      product_name: String(product_name).slice(0, 200),
      product_price: Number(product_price),
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data }, { status: 201 });
}

// GET /api/orders → admin only, list orders
export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}

// PATCH /api/orders → admin only, update status
export async function PATCH(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const { id, status } = body || {};
  const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!id || !allowed.includes(status)) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

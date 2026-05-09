import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isAdminAuthorized } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

// GET /api/product → public, returns the single product
export async function GET() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ product: null }, { status: 200 });
  }

  return NextResponse.json({ product: data });
}

// PUT /api/product → admin only, updates the product
export async function PUT(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const { id, name, description, price, currency, image_url } = body || {};

  if (!name || !description || !image_url || price == null) {
    return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 });
  }

  const numericPrice = Number(price);
  if (Number.isNaN(numericPrice) || numericPrice < 0) {
    return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const payload = {
    name: String(name).trim(),
    description: String(description).trim(),
    price: numericPrice,
    currency: String(currency || 'دج').trim(),
    image_url: String(image_url).trim(),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data, error } = await admin
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data });
  }

  const { data, error } = await admin
    .from('products')
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

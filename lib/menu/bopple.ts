export interface BoppleCategory {
  id: number
  category_desc: string
  image_thumb_url: string | null
}

export interface BoppleProduct {
  id: number
  product_name: string
  product_desc: string | null
  price: number
  price_min: number
  price_max: number
  image_thumb_url: string | null
}

const BASE = 'https://orders.bopple.me/api/venues/big-red-cafe/menu'
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-AU,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Origin': 'https://bopple.app',
  'Referer': 'https://bopple.app/big-red-cafe',
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: HEADERS,
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Bopple API ${path}: ${res.status} ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  return (Array.isArray(json) ? json : json.data ?? json) as T
}

export async function fetchCategories(): Promise<BoppleCategory[]> {
  return get<BoppleCategory[]>('/categories?order_type=COLLECT')
}

export async function fetchProducts(categoryId: number): Promise<BoppleProduct[]> {
  return get<BoppleProduct[]>(`/categories/${categoryId}/products?order_type=COLLECT&detail=true`)
}

export async function fetchMenu(): Promise<{ category: BoppleCategory; products: BoppleProduct[] }[]> {
  const categories = await fetchCategories()
  const filtered = categories.filter(c => c.category_desc !== 'Gift Vouchers')
  const results = await Promise.all(
    filtered.map(async (category) => ({
      category,
      products: await fetchProducts(category.id),
    }))
  )
  return results
}

export function formatPrice(product: BoppleProduct): string {
  const fmt = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
  if (product.price_max && product.price_max !== product.price_min) {
    return `${fmt(product.price_min)}–${fmt(product.price_max)}`
  }
  return fmt(product.price_min || product.price)
}

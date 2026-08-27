export interface BoppleCategory {
  id: number
  name: string
  image_url: string | null
}

export interface BoppleProduct {
  id: number
  name: string
  description: string | null
  base_price: number
  max_price: number | null
  image_url: string | null
}

const BASE = 'https://orders.bopple.me/api/venues/big-red-cafe/menu'
const HEADERS = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: HEADERS,
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`Bopple API ${path}: ${res.status}`)
  const json = await res.json()
  return (json.data ?? json) as T
}

export async function fetchCategories(): Promise<BoppleCategory[]> {
  return get<BoppleCategory[]>('/categories?order_type=COLLECT')
}

export async function fetchProducts(categoryId: number): Promise<BoppleProduct[]> {
  return get<BoppleProduct[]>(`/categories/${categoryId}/products?order_type=COLLECT&detail=true`)
}

export async function fetchMenu(): Promise<{ category: BoppleCategory; products: BoppleProduct[] }[]> {
  const categories = await fetchCategories()
  const filtered = categories.filter(c => c.name !== 'Gift Vouchers')
  const results = await Promise.all(
    filtered.map(async (category) => ({
      category,
      products: await fetchProducts(category.id),
    }))
  )
  return results
}

export function formatPrice(product: BoppleProduct): string {
  const min = (product.base_price / 100).toFixed(2).replace(/\.00$/, '')
  if (product.max_price && product.max_price !== product.base_price) {
    const max = (product.max_price / 100).toFixed(2).replace(/\.00$/, '')
    return `$${min}–$${max}`
  }
  return `$${min}`
}

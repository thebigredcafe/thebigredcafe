import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { fetchMenu, formatPrice, type BoppleCategory, type BoppleProduct } from '@/lib/menu/bopple'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

function placeholder(p: BoppleProduct): string {
  return `<div class="menu-item-img-placeholder"><svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" stroke="#2B1F17" stroke-width="1.5"/></svg></div>`
}

function productCard(p: BoppleProduct): string {
  const imgEl = p.image_thumb_url
    ? `<img class="menu-item-img" src="${p.image_thumb_url}" alt="${esc(p.product_name)}" loading="lazy">`
    : placeholder(p)
  const img = `<a href="https://bopple.app/big-red-cafe/bio" target="_blank" rel="noopener" class="menu-item-img-link">${imgEl}</a>`
  const desc = p.product_desc ? `<p class="item-desc">${esc(p.product_desc)}</p>` : ''
  return `
          <div class="menu-item reveal">
            ${img}
            <div class="menu-item-body"><div class="item-top"><span class="item-name">${esc(p.product_name)}</span><span class="price">${formatPrice(p)}</span></div>${desc}</div>
          </div>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function tabId(name: string): string {
  return 'tab-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

function buildMenuHtml(menu: { category: BoppleCategory; products: BoppleProduct[] }[]): string {
  const tabs = menu.map((m, i) =>
    `<button class="menu-tab${i === 0 ? ' active' : ''}" onclick="switchTab(this,'${tabId(m.category.category_desc)}')">${esc(m.category.category_desc)}</button>`
  ).join('\n        ')

  const panels = menu.map((m, i) => {
    const cols = m.products.length <= 6 ? ' cols2' : ''
    const cards = m.products.map(productCard).join('')
    return `
      <div class="menu-panel${i === 0 ? ' active' : ''}" id="${tabId(m.category.category_desc)}">
        <div class="menu-grid${cols}">${cards}
        </div>
      </div>`
  }).join('\n')

  return `<div class="menu-tabs reveal">
        ${tabs}
      </div>
${panels}`
}

export async function GET() {
  const template = readFileSync(join(process.cwd(), 'public-site/index.html'), 'utf-8')

  let menuHtml: string
  try {
    const menu = await fetchMenu()
    menuHtml = buildMenuHtml(menu)
  } catch (err) {
    console.error('Bopple fetch failed, falling back to empty menu:', err)
    menuHtml = '<p style="color:#A6332B;padding:16px 0">Menu temporarily unavailable — <a href="https://bopple.app/big-red-cafe/bio">order on Bopple</a>.</p>'
  }

  const html = template.replace('{{MENU_CONTENT}}', menuHtml)

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

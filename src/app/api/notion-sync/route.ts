import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const NOTION_VERSION = '2025-09-03'

export async function GET() {
  const notionKey = process.env.NOTION_API_KEY
  const dataSourceId = process.env.NOTION_PROYECTOS_DATA_SOURCE_ID

  if (!notionKey || !dataSourceId) {
    return NextResponse.json(
      { error: 'Falta configurar NOTION_API_KEY / NOTION_PROYECTOS_DATA_SOURCE_ID en las variables de entorno' },
      { status: 500 }
    )
  }

  const notionRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { property: 'Status', select: { equals: 'Facturado' } },
    }),
    cache: 'no-store',
  })

  if (!notionRes.ok) {
    const errText = await notionRes.text()
    return NextResponse.json({ error: `Notion API error: ${errText}` }, { status: 502 })
  }

  const notionData = await notionRes.json()

  const proyectos = (notionData.results || []).map((page: any) => ({
    notionId: page.id as string,
    proyecto: page.properties?.Proyecto?.title?.[0]?.plain_text || 'Sin nombre',
    cliente: page.properties?.Cliente?.select?.name || '',
    total: page.properties?.['Total €']?.formula?.number ?? 0,
  }))

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: existentes } = await supabase
    .from('facturas')
    .select('notion_proyecto')
    .not('notion_proyecto', 'is', null)

  const yaImportados = new Set((existentes || []).map(f => f.notion_proyecto))
  const pendientes = proyectos.filter((p: { notionId: string }) => !yaImportados.has(p.notionId))

  return NextResponse.json({ pendientes })
}

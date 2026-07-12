type HolidayApiResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string }
    body?: {
      items?: {
        item?:
          | Array<{ locdate?: string | number; dateName?: string; isHoliday?: string }>
          | { locdate?: string | number; dateName?: string; isHoliday?: string }
      }
    }
  }
}

export const onRequestGet: PagesFunction<{ HOLIDAY_API_KEY?: string }> = async ({ request, env }) => {
  const year = new URL(request.url).searchParams.get('year')
  if (!year || !/^\d{4}$/.test(year)) {
    return Response.json({ error: 'year must be a four-digit year' }, { status: 400 })
  }

  if (!env.HOLIDAY_API_KEY) {
    return Response.json({ error: 'HOLIDAY_API_KEY is not configured' }, { status: 503 })
  }

  const endpoint = new URL(
    'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo',
  )
  endpoint.searchParams.set('serviceKey', env.HOLIDAY_API_KEY)
  endpoint.searchParams.set('solYear', year)
  endpoint.searchParams.set('numOfRows', '100')
  endpoint.searchParams.set('pageNo', '1')
  endpoint.searchParams.set('_type', 'json')

  try {
    const upstream = await fetch(endpoint)
    if (!upstream.ok) {
      return Response.json({ error: 'holiday API request failed' }, { status: 502 })
    }

    const payload = (await upstream.json()) as HolidayApiResponse
    const resultCode = payload.response?.header?.resultCode
    if (resultCode && resultCode !== '00') {
      return Response.json(
        { error: payload.response?.header?.resultMsg ?? 'holiday API returned an error' },
        { status: 502 },
      )
    }

    const rawItems = payload.response?.body?.items?.item ?? []
    const items = Array.isArray(rawItems) ? rawItems : [rawItems]
    const holidays = items
      .map((item) => ({
        date: String(item.locdate ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
        name: item.dateName ?? '',
        isHoliday: item.isHoliday === 'Y',
      }))
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.isHoliday)

    return Response.json(
      { year, holidays },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    )
  } catch {
    return Response.json({ error: 'holiday API request failed' }, { status: 502 })
  }
}

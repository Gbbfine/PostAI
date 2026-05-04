import { useEffect, useCallback } from 'react'
import {
  useSystemConfigStore,
  type CurrencyConfig,
  type CurrencyDisplayType,
  type SystemConfig,
  DEFAULT_CURRENCY_CONFIG,
} from '@/stores/system-config-store'
import { DEFAULT_SYSTEM_NAME, DEFAULT_LOGO } from '@/lib/constants'
import { applyFaviconToDom } from '@/lib/dom-utils'

interface UseSystemConfigOptions {
  /** Automatically fetch config from backend (use only in root component) */
  autoLoad?: boolean
}

interface StatusApiResponse {
  success: boolean
  data: {
    system_name?: string
    logo?: string
    footer_html?: string
    demo_site_enabled?: boolean
    display_token_stat_enabled?: boolean
    display_in_currency?: boolean
    quota_display_type?: CurrencyDisplayType
    quota_per_unit?: number
    usd_exchange_rate?: number
    custom_currency_symbol?: string
    custom_currency_exchange_rate?: number
  }
}

function normalizeSystemName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!value) return DEFAULT_SYSTEM_NAME

  const normalized = value.toLowerCase()
  if (
    normalized.includes('new api') ||
    normalized.includes('new-api') ||
    normalized.includes('newapi') ||
    normalized.includes('ai gateway')
  ) {
    return DEFAULT_SYSTEM_NAME
  }

  return value
}

function normalizeLogoUrl(logo: unknown): string {
  const value = typeof logo === 'string' ? logo.trim() : ''
  if (!value) return DEFAULT_LOGO

  const normalized = value.toLowerCase()
  if (
    normalized === '/logo.png' ||
    normalized.endsWith('/logo.png') ||
    normalized.endsWith('/new-api/logo.png')
  ) {
    return DEFAULT_LOGO
  }

  return value
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

/**
 * Map `/api/status` response data to our persisted system config structure
 */
export function mapStatusDataToConfig(
  data: StatusApiResponse['data'] | undefined
): Partial<SystemConfig> {
  if (!data) return {}

  const quotaDisplayType =
    (data.quota_display_type as CurrencyDisplayType | undefined) ??
    DEFAULT_CURRENCY_CONFIG.quotaDisplayType

  const currency: CurrencyConfig = {
    displayInCurrency:
      data.display_in_currency ?? DEFAULT_CURRENCY_CONFIG.displayInCurrency,
    quotaDisplayType,
    quotaPerUnit: toNumber(
      data.quota_per_unit,
      DEFAULT_CURRENCY_CONFIG.quotaPerUnit
    ),
    usdExchangeRate: toNumber(
      data.usd_exchange_rate,
      DEFAULT_CURRENCY_CONFIG.usdExchangeRate
    ),
    customCurrencySymbol:
      data.custom_currency_symbol?.trim() ||
      DEFAULT_CURRENCY_CONFIG.customCurrencySymbol,
    customCurrencyExchangeRate: toNumber(
      data.custom_currency_exchange_rate,
      DEFAULT_CURRENCY_CONFIG.customCurrencyExchangeRate
    ),
  }

  return {
    systemName: normalizeSystemName(data.system_name),
    logo: normalizeLogoUrl(data.logo),
    footerHtml: data.footer_html,
    demoSiteEnabled: data.demo_site_enabled,
    displayTokenStatEnabled: data.display_token_stat_enabled,
    currency,
  }
}

// Fetch system config from API
async function fetchSystemConfig(): Promise<Partial<SystemConfig>> {
  const response = await fetch('/api/status')
  if (!response.ok) throw new Error('Failed to fetch status')

  const data: StatusApiResponse = await response.json()
  if (!data.success) throw new Error('API returned error')

  return mapStatusDataToConfig(data.data)
}

// Preload image and return cleanup function
function preloadImage(
  src: string,
  onLoad: () => void,
  onError: () => void
): () => void {
  const img = new Image()
  img.onload = onLoad
  img.onerror = onError
  img.src = src

  return () => {
    img.onload = null
    img.onerror = null
  }
}

/**
 * System configuration hook with auto-loading and logo preloading
 *
 * @example
 * // Root component - auto-load from backend
 * useSystemConfig({ autoLoad: true })
 *
 * @example
 * // Other components - use cached config
 * const { systemName, logo, loading } = useSystemConfig()
 */
export function useSystemConfig(options: UseSystemConfigOptions = {}) {
  const { autoLoad = false } = options
  const {
    config,
    loading,
    loadedLogoUrl,
    setConfig,
    setLoadedLogoUrl,
    setLoading,
  } = useSystemConfigStore()
  const normalizedSystemName = normalizeSystemName(config.systemName)
  const normalizedLogo = normalizeLogoUrl(config.logo)

  // Load config from backend
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const newConfig = await fetchSystemConfig()
      setConfig(newConfig)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load system config:', error)
    } finally {
      setLoading(false)
    }
  }, [setConfig, setLoading])

  useEffect(() => {
    if (autoLoad) loadConfig()
  }, [autoLoad, loadConfig])

  useEffect(() => {
    if (
      normalizedSystemName !== config.systemName ||
      normalizedLogo !== config.logo
    ) {
      setConfig({
        systemName: normalizedSystemName,
        logo: normalizedLogo,
      })
    }
  }, [
    config.logo,
    config.systemName,
    normalizedLogo,
    normalizedSystemName,
    setConfig,
  ])

  // Preload logo image when URL changes
  useEffect(() => {
    const logo = normalizedLogo

    // Skip if logo is already loaded
    if (!logo || logo === loadedLogoUrl) return

    // Preload new logo
    return preloadImage(
      logo,
      () => {
        setLoadedLogoUrl(logo)
        applyFaviconToDom(logo)
      },
      () => {
        if (logo !== DEFAULT_LOGO) {
          // eslint-disable-next-line no-console
          console.error('Failed to load logo:', logo)
        }
        // Mark as loaded even on error to prevent infinite retry
        setLoadedLogoUrl(logo)
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedLogoUrl, normalizedLogo, setLoadedLogoUrl])

  return {
    ...config,
    systemName: normalizedSystemName,
    logo: normalizedLogo,
    loading,
    logoLoaded: normalizedLogo === loadedLogoUrl && !!loadedLogoUrl,
  }
}

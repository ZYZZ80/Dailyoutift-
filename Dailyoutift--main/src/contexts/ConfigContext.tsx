import React, { createContext, useContext } from 'react'
import type { AppConfig } from '../lib/storage'

interface ConfigContextValue {
  config: AppConfig
  setConfig: (c: AppConfig) => void
  isConfigured: boolean
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

interface ConfigProviderProps {
  config: AppConfig
  setConfig: (c: AppConfig) => void
  isConfigured: boolean
  children: React.ReactNode
}

export function ConfigProvider({
  config,
  setConfig,
  isConfigured,
  children,
}: ConfigProviderProps) {
  return (
    <ConfigContext.Provider value={{ config, setConfig, isConfigured }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>')
  return ctx
}

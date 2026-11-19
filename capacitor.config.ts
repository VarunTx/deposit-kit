import type { CapacitorConfig } from '@capacitor/cli'

// appId is permanent once the app is published in either store. Change it before the first upload if needed.
const config: CapacitorConfig = {
  appId: 'us.varuntx.depositkit',
  appName: 'Deposit Kit',
  webDir: 'dist',
  backgroundColor: '#f4f7f6',
}

export default config

declare module 'web-push' {
  interface PushSubscription {
    endpoint: string
    keys?: {
      auth?: string
      p256dh?: string
    }
  }

  interface WebPush {
    setVapidDetails(contactEmail: string, publicKey: string, privateKey: string): void
    sendNotification(subscription: PushSubscription, payload?: string): Promise<void>
  }

  const webPush: WebPush
  export default webPush
}

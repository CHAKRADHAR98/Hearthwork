'use server'
import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { cookies } from 'next/headers'

/**
 * Agora token for one call. The token must be issued for the exact user account the browser joins with
 * (videoChat joins with a string account, so a numeric uid-0 token is rejected), and this builder takes
 * expiry as "seconds from now", not as a timestamp.
 */
export async function generateToken(channelName: string, account: string) {
    const token = cookies().get('token')?.value
    if (!token) return null

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID
    const appCertificate = process.env.APP_CERTIFICATE
    if (!appId || !appCertificate) {
        console.error('[video] NEXT_PUBLIC_AGORA_APP_ID or APP_CERTIFICATE is not set')
        return null
    }
    const validForSeconds = 3600
    return RtcTokenBuilder.buildTokenWithUserAccount(appId, appCertificate, channelName, account, RtcRole.PUBLISHER, validForSeconds, validForSeconds)
}

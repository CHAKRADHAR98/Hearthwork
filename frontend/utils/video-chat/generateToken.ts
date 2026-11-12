'use server'
import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { cookies } from 'next/headers'

export async function generateToken(channelName: string) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value
    
    if (!token) return null

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID!
    const appCertificate = process.env.APP_CERTIFICATE!
    const uid = 0
    const role = RtcRole.PUBLISHER
    const expireTime = 3600
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const expiredTs = currentTimestamp + expireTime

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        role,
        expiredTs,
        expiredTs,
    )

    return agoraToken
}
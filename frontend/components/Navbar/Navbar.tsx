import React from 'react'
import { cookies } from 'next/headers'
import { NavbarChild } from './NavbarChild'
import { verifyToken } from '@/utils/auth/server'

export const Navbar:React.FC = async () => {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value
    
    let username = 'Guest'
    
    if (token) {
        const user = await verifyToken(token)
        if (user) {
            username = user.username
        }
    }

    return (
        <NavbarChild name={username} avatar_url={undefined}/>
    )
}

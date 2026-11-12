import { type NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value
    const { pathname } = request.nextUrl

    // Protected routes that require authentication
    const protectedRoutes = ['/app', '/play', '/editor', '/manage']
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

    if (isProtectedRoute && !token) {
        const url = new URL('/signin', request.url)
        return NextResponse.redirect(url)
    }

    // Redirect authenticated users away from signin page
    if (pathname === '/signin' && token) {
        const url = new URL('/app', request.url)
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
}

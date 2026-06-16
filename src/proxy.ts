import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('attendance_session');

  // 1. Unauthenticated Users
  if (!sessionCookie) {
    // Protect /admin routes
    if (pathname.startsWith('/admin')) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 2. Authenticated Users
  try {
    const session = JSON.parse(sessionCookie.value);
    const isAdmin = ['Admin', 'Manager', 'HR'].includes(session.role);

    // If Admin hits root /, redirect to dashboard
    if (pathname === '/' && isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }

    // Protection for /admin
    if (pathname.startsWith('/admin')) {
      if (!isAdmin) {
        // Staff trying to access admin -> Redirect to root with error
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.searchParams.set('error', 'access_denied');
        return NextResponse.redirect(url);
      }

      // Specific restriction: Only Admin can access /admin/users
      if (pathname.startsWith('/admin/users') && session.role !== 'Admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        return NextResponse.redirect(url);
      }
    }

  } catch {
    // Corrupted cookie -> Delete and redirect to root
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('attendance_session');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/admin', '/'],
};

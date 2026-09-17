import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isAuth0Configured } from '@cmp/auth';
import { getAuth0 } from './lib/auth0';

const PUBLIC = ['/auth'];

function isPublicPath(pathname: string) {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function authNotConfiguredResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Admin — auth not configured</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">
  <h1>Auth0 is not configured</h1>
  <p>Set <code>AUTH0_DOMAIN</code>, <code>AUTH0_CLIENT_ID</code>, <code>AUTH0_CLIENT_SECRET</code>, and <code>AUTH0_SECRET</code> on the admin service.</p>
  <p>See <code>docs/AUTH0-SETUP.md</code> in the repository.</p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAuth0Configured()) {
    return NextResponse.next();
  }

  if (pathname === '/auth/callback' && request.nextUrl.searchParams.has('error')) {
    const description =
      request.nextUrl.searchParams.get('error_description') ??
      request.nextUrl.searchParams.get('error') ??
      'Login failed';
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('login_error', description);
    return NextResponse.redirect(login);
  }

  try {
    if (isPublicPath(pathname)) {
      const authResponse = await getAuth0().middleware(request);
      authResponse.headers.set('x-middleware-pathname', pathname);
      return authResponse;
    }

    const authResponse = await getAuth0().middleware(request);
    const session = await getAuth0().getSession(request);
    if (!session?.user) {
      const login = new URL('/auth/login', request.url);
      login.searchParams.set('returnTo', pathname + request.nextUrl.search);
      return NextResponse.redirect(login);
    }

    authResponse.headers.set('x-middleware-pathname', pathname);
    return authResponse;
  } catch (err) {
    console.error('[middleware] Fatal auth error:', err);
    return authNotConfiguredResponse();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|loading-spinner.png|sitemap.xml|robots.txt).*)'],
};

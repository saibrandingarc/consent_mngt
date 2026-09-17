import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { getAuth0ClientId, getAuth0ClientSecret, isAuth0Configured } from '@cmp/auth';

let auth0Client: Auth0Client | undefined;

function adminBaseUrl() {
  return (
    process.env.ADMIN_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/\/$/, '') ||
    'http://localhost:3001'
  );
}

export function getAuth0() {
  if (!auth0Client) {
    const appBaseUrl = adminBaseUrl();
    auth0Client = new Auth0Client({
      appBaseUrl,
      clientId: getAuth0ClientId(),
      clientSecret: getAuth0ClientSecret(),
      signInReturnToPath: '/dashboard',
      session: {
        cookie: {
          name: '__cmp_admin_session',
          sameSite: 'lax',
        },
      },
      transactionCookie: {
        prefix: '__cmp_admin_txn_',
      },
      authorizationParameters: {
        scope: 'openid profile email offline_access',
        ...(process.env.AUTH0_AUDIENCE ? { audience: process.env.AUTH0_AUDIENCE } : {}),
      },
      async onCallback(error, context) {
        if (error) {
          console.error('[auth0][admin] Callback failed:', error);
          return NextResponse.redirect(new URL('/', `${appBaseUrl}/`));
        }
        return NextResponse.redirect(new URL(context.returnTo || '/dashboard', `${appBaseUrl}/`));
      },
    });
  }
  return auth0Client;
}

export { isAuth0Configured };

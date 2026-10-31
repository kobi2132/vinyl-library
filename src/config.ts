// Google OAuth Web Client ID. This is a public identifier, not a secret.
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '393261470985-qg616i58qiv8r4pm49tg3jlam23873b2.apps.googleusercontent.com'

export const DRIVE_FILE_NAME = 'vinyl-library.json'

/** The app's owner: only this Google account sees the developer page (the server checks it too). */
export const ADMIN_EMAIL = 'kobi2132@gmail.com'

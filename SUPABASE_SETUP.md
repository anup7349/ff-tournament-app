# Shared Database Setup

The APK cannot share data between phones by itself. Use Supabase as the shared database.

1. Create a free Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. In Authentication settings, enable Email/Password login.
4. In Authentication > Providers > Email, you can keep email confirmation on for real users. For quick testing, turn off "Confirm email".
5. Copy your Project URL and public anon key into `supabase-config.js`.
6. Rebuild the APK with:

```powershell
.\gradlew.bat assembleDebug
```

Only use the anon key in the app. Do not put the service role key in Android or web files.

Current app status: local/offline storage is still active until `app.js` is connected to Supabase using your project URL and anon key.

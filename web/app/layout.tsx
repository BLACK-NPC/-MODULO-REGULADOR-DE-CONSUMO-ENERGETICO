import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { PwaRegister } from '@/components/pwa-register'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/lib/brand'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  generator: APP_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icono-192.png',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#2EAF4A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className="font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              function hablarNav(){
                if(window.__saludoNav||!window.speechSynthesis)return;
                window.__saludoNav=1;
                var u=new SpeechSynthesisUtterance("Hola señor. ¿Qué tal se siente el día de hoy? ¿Desea que le dé el resumen del día? O, ¿quiere saber algún dato en particular?");
                u.lang="es-MX";
                u.onstart=function(){window.__saludoNav=1};
                u.onend=function(){window.__saludoFin=1};
                u.onerror=function(){window.__saludoFin=1};
                window.speechSynthesis.resume();
                window.speechSynthesis.speak(u);
              }
              window.__jorgeListo=fetch("/api/voz",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texto:"Hola señor."})}).then(function(r){return r.ok?r.blob():null}).then(function(blob){
                if(!blob){hablarNav();return null}
                var a=new Audio(URL.createObjectURL(blob));
                a.setAttribute("playsinline","");
                window.__jorgeAudio=a;
                return a.play().then(function(){window.__jorgeSono=1;return blob}).catch(function(){window.__jorgeSono=0;hablarNav();return blob});
              }).catch(function(){hablarNav();return null});
            })();`,
          }}
        />
        <PwaRegister />
        {children}
        <Toaster theme="dark" richColors position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

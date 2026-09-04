export const metadata = {
  title: 'URL Health Checker',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ 
        fontFamily: 'monospace', 
        maxWidth: '900px', 
        margin: '40px auto',
        padding: '0 20px',
        backgroundColor: '#111',
        color: '#eee',
      }}>
        {children}
      </body>
    </html>
  )
}

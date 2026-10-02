import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Taskwell | Fewer status meetings, clearer work",
  description:
    "One live board for your team's tasks, owners and deadlines.",
  openGraph: {
    title: "Taskwell",
    description:
      "One live board for your team's tasks, owners and deadlines.",
    type: "website",
  },
};

const themeInitializationScript = `
  (() => {
    try {
      const storedTheme = localStorage.getItem("taskwell-theme");
      const theme = storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch {
      document.documentElement.classList.toggle(
        "dark",
        window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script
          id="taskwell-theme-init"
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
      </head>
      <body className="bg-paper font-body text-ink antialiased transition-colors duration-200 dark:bg-dark-background dark:text-slate-50 motion-reduce:transition-none">
        {children}
      </body>
    </html>
  );
}
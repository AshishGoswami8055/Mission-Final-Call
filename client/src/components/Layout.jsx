import { useState } from "react";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/**
 * App shell.
 *
 *   <Layout
 *     title="Dashboard"
 *     subtitle="Live workspace overview"
 *     actions={<>…</>}
 *     searchValue={search}
 *     onSearchChange={setSearch}
 *     searchPlaceholder="Search content…"
 *   >
 *     {pageContent}
 *   </Layout>
 *
 * The topbar shows search + bell + user. The page title/subtitle/actions are
 * rendered as a compact header **inside** the main content area, exactly
 * matching the reference dashboard layout.
 */
const Layout = ({
  title,
  subtitle,
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  showSearch = true,
  children,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-white text-slate-800 dark:bg-[#0a0a0a] dark:text-slate-100">
      {/* Desktop primary nav */}
      <aside className="hidden bg-white dark:bg-white lg:flex lg:w-72 lg:flex-col">
        <div className="fixed inset-y-0 left-0 w-72 border-r border-black/10 dark:border-slate-200/90">
          <Sidebar />
        </div>
      </aside>

      {/* Main column — dark canvas behind cards (reference store overview) */}
      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#0a0a0a]">
        <Topbar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          showSearch={showSearch}
        />

        <main className="anim-fade-in flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {(title || actions) && (
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                {title && (
                  <h1 className="font-display truncate text-2xl text-slate-900 sm:text-[28px] dark:text-slate-50">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </header>
          )}
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        title="Navigation"
      >
        <Sidebar onItemClick={() => setMobileNavOpen(false)} />
      </MobileNav>
    </div>
  );
};

export default Layout;

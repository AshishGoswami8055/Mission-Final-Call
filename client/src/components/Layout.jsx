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

        <main className="anim-fade-in flex-1 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
          {(title || actions) && (
            <header className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                {title && (
                  <h1 className="font-display truncate text-xl text-slate-900 sm:text-2xl sm:text-[28px] dark:text-slate-50">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 max-w-2xl text-xs text-slate-500 sm:text-sm dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
                  {actions}
                </div>
              )}
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

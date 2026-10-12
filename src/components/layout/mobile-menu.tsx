"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, Menu, ShieldCheck, Store, UserRound, X } from "lucide-react";
import { MAIN_NAV, ROUTES } from "@/config/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, type HeaderAccount } from "./account-menu";
import { LogoMark } from "./logo";

type MenuCategory = { slug: string; name: string };

const itemClass =
  "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base font-medium text-gray-900 hover:bg-muted";

/**
 * Hamburger menu for small screens. Uses the native <dialog> element, which provides focus
 * trapping, Escape to close and a backdrop without extra JavaScript.
 * `account`: the signed-in user, null when signed out, undefined while still loading.
 */
export function MobileMenu({
  categories,
  account,
}: {
  categories: MenuCategory[];
  account: HeaderAccount | null | undefined;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="-mr-2 flex size-11 items-center justify-center rounded-lg text-gray-800 hover:bg-muted"
      >
        <Menu aria-hidden="true" className="size-6" />
        <span className="sr-only">Open menu</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Menu"
        onClick={(event) => {
          // Close when the backdrop (the dialog element itself) is clicked.
          if (event.target === dialogRef.current) close();
        }}
        className="m-0 ml-auto h-dvh max-h-none w-[86%] max-w-sm bg-white p-0 shadow-raised backdrop:bg-gray-950/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-header items-center justify-between border-b border-border px-4">
            <span className="flex items-center gap-2 font-bold text-gray-900">
              <LogoMark className="size-7" />
              Menu
            </span>
            <button
              type="button"
              onClick={close}
              className="-mr-2 flex size-11 items-center justify-center rounded-lg text-gray-700 hover:bg-muted"
            >
              <X aria-hidden="true" className="size-6" />
              <span className="sr-only">Close menu</span>
            </button>
          </div>

          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-2 py-3">
            {account && (
              <div className="mx-1 mb-3 flex items-center gap-3 rounded-xl bg-brand-50 p-3">
                <Avatar initials={account.initials} className="size-11 text-base" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{account.fullName}</p>
                  <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                </div>
              </div>
            )}
            <ul className="space-y-0.5">
              {MAIN_NAV.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={close} className={itemClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              {account && (
                <>
                  <li>
                    <Link href={ROUTES.account} onClick={close} className={itemClass}>
                      <UserRound aria-hidden="true" className="size-5 text-gray-500" />
                      My account
                    </Link>
                  </li>
                  <li>
                    <Link href={ROUTES.dashboard} onClick={close} className={itemClass}>
                      <Store aria-hidden="true" className="size-5 text-gray-500" />
                      My businesses
                    </Link>
                  </li>
                  {account.isAdmin && (
                    <li>
                      <Link href="/admin" onClick={close} className={`${itemClass} text-brand-800`}>
                        <ShieldCheck aria-hidden="true" className="size-5 text-brand-700" />
                        Admin
                      </Link>
                    </li>
                  )}
                  <li>
                    <form action={logoutAction}>
                      <button type="submit" className={`${itemClass} text-red-700`}>
                        <LogOut aria-hidden="true" className="size-5" />
                        Log out
                      </button>
                    </form>
                  </li>
                </>
              )}
              {account === null && (
                <>
                  <li>
                    <Link href={ROUTES.login} onClick={close} className={itemClass}>
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link href={ROUTES.signup} onClick={close} className={itemClass}>
                      Create an account
                    </Link>
                  </li>
                </>
              )}
            </ul>

            <p className="mt-5 mb-1 px-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Popular categories
            </p>
            <ul className="space-y-0.5">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={ROUTES.category(category.slug)}
                    onClick={close}
                    className="flex h-11 items-center justify-between rounded-lg px-3 text-sm text-gray-700 hover:bg-muted"
                  >
                    {category.name}
                    <ChevronRight aria-hidden="true" className="size-4 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Link
              href={ROUTES.listBusiness}
              onClick={close}
              className={buttonVariants({ variant: "accent", size: "lg", fullWidth: true })}
            >
              List your business
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

// The signed-in pages (requests, admin) share a centered, padded column.
// The home and login pages sit outside this route group, so their hero can
// run edge to edge. The "(portal)" folder name doesn't appear in URLs.
export default function PortalLayout({ children }: LayoutProps<"/">) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-8">{children}</div>;
}

export default function ChannelsSection({ channels }) {
  return (
    <section id="channels" className="mx-auto mt-5 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Popular Channels</h2>
        <a href="#" className="text-sm font-semibold text-indigo-700 transition hover:text-indigo-900">
          Browse directory
        </a>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {channels.map((channel) => (
          <button
            type="button"
            key={channel}
            className="rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-px hover:bg-indigo-50"
          >
            {channel}
          </button>
        ))}
      </div>
    </section>
  );
}

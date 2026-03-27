'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { FlowPulseLogo } from '@/components/brand-logo';
import { api, BlogPostSummary } from '@/lib/api';
import { BookOpen, Building2, ExternalLink, UserRound } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function BlogPage() {
  const { data, isLoading } = useSWR<BlogPostSummary[]>('blog-posts', () => api.getBlogPosts(30));

  return (
    <div className="min-h-screen pb-14">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/20 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" aria-label="FlowPulse home">
            <FlowPulseLogo />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="btn-secondary px-3 py-2 text-xs">Home</Link>
            <Link href="/login" className="btn-primary px-4 py-2 text-xs">Get Started</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pt-10 md:px-8 md:pt-14">
        <section className="glass-header p-7 md:p-10">
          <p className="badge-soft">
            <BookOpen className="h-3.5 w-3.5" />
            Insights & Resources
          </p>
          <h1 className="mt-4 text-4xl font-semibold [font-family:var(--font-heading)] md:text-5xl">FlowPulse Blog</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
            Articles on team health, engineering operations, and privacy-first analytics.
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-52 animate-pulse bg-white/5" />
          ))}

          {(data || []).map((post) => (
            <article key={post.id} className="card flex flex-col p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                {(post.tags || []).slice(0, 3).map((tag) => (
                  <span key={tag} className="badge-soft">{tag}</span>
                ))}
              </div>
              <h2 className="text-xl font-semibold [font-family:var(--font-heading)]">{post.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{post.summary}</p>

              <div className="mt-4 space-y-1 text-xs text-slate-400">
                <p className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{post.author_name}</p>
                {post.company_name && (
                  <p className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{post.company_name}</p>
                )}
                {post.published_at && <p>{format(parseISO(post.published_at), 'MMM d, yyyy')}</p>}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Link href={`/blog/${post.slug}`} className="btn-primary px-3 py-2 text-xs">Read article</Link>
                {post.resource_url && (
                  <a href={post.resource_url} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-2 text-xs">
                    Resource
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

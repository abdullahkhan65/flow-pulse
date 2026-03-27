'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api, BlogPost } from '@/lib/api';
import { FlowPulseLogo } from '@/components/brand-logo';
import { Building2, ExternalLink, UserRound } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const { data, isLoading, error } = useSWR<BlogPost>(
    slug ? `blog-post-${slug}` : null,
    () => api.getBlogPostBySlug(slug),
  );

  return (
    <div className="min-h-screen pb-14">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/20 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-5 md:px-8">
          <Link href="/" aria-label="FlowPulse home">
            <FlowPulseLogo />
          </Link>
          <Link href="/blog" className="btn-secondary px-3 py-2 text-xs">Back to blog</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 pt-10 md:px-8 md:pt-14">
        {isLoading && <div className="card h-72 animate-pulse bg-white/5" />}

        {error && (
          <div className="card p-8 text-center text-red-600">
            Article not found.
          </div>
        )}

        {data && (
          <article className="glass-header p-7 md:p-10">
            <div className="mb-4 flex flex-wrap gap-2">
              {(data.tags || []).map((tag) => <span key={tag} className="badge-soft">{tag}</span>)}
            </div>

            <h1 className="text-3xl font-semibold leading-tight [font-family:var(--font-heading)] md:text-5xl">{data.title}</h1>
            <p className="mt-4 text-base text-slate-300">{data.summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{data.author_name}</span>
              {data.company_name && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{data.company_name}</span>}
              {data.published_at && <span>{format(parseISO(data.published_at), 'MMM d, yyyy')}</span>}
            </div>

            <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-slate-200 md:text-base">
              {data.content}
            </div>

            {data.resource_url && (
              <div className="mt-8 border-t border-white/10 pt-6">
                <a href={data.resource_url} target="_blank" rel="noreferrer" className="btn-primary px-4 py-2 text-xs">
                  Open Resource
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

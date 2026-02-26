'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api, AdminOverview, BlogPost, BlogPostInput } from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { BarChart3, Building2, FileText, Link2, Plus, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

const emptyForm: BlogPostInput = {
  title: '',
  summary: '',
  content: '',
  authorName: '',
  companyName: '',
  resourceUrl: '',
  coverImageUrl: '',
  tags: [],
  status: 'draft',
};

export default function AdminPage() {
  const router = useRouter();
  const { data: me } = useSWR('me', () => api.getMe());
  const { data: overview } = useSWR<AdminOverview>('admin-overview', () => api.getAdminOverview());
  const { data: posts, mutate: mutatePosts } = useSWR<BlogPost[]>('admin-blog-posts', () => api.getAdminBlogPosts());

  const [form, setForm] = useState<BlogPostInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalPosts = overview?.totals.blogPosts || { total: 0, published: 0, draft: 0 };

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);

  useEffect(() => {
    if (me && !['owner', 'admin'].includes(me.role)) {
      router.replace('/dashboard');
    }
  }, [me, router]);

  if (me && !['owner', 'admin'].includes(me.role)) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload: BlogPostInput = {
      ...form,
      tags: (form.tags || []).filter(Boolean),
      companyName: form.companyName || undefined,
      resourceUrl: form.resourceUrl || undefined,
      coverImageUrl: form.coverImageUrl || undefined,
    };

    try {
      if (editingId) await api.updateAdminBlogPost(editingId, payload);
      else await api.createAdminBlogPost(payload);

      setForm(emptyForm);
      setEditingId(null);
      await mutatePosts();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (post: BlogPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      summary: post.summary,
      content: post.content,
      authorName: post.author_name,
      companyName: post.company_name || '',
      resourceUrl: post.resource_url || '',
      coverImageUrl: post.cover_image_url || '',
      tags: post.tags || [],
      status: post.status,
    });
  };

  const removePost = async (id: string) => {
    await api.deleteAdminBlogPost(id);
    await mutatePosts();
  };

  return (
    <div className="space-y-6 reveal-up">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">Admin Console</h1>
        <p className="mt-1 text-sm text-slate-600">Platform-level insights and blog content management.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Organizations</p>
          <p className="mt-2 text-2xl font-semibold [font-family:var(--font-heading)]">{overview?.totals.organizations ?? 0}</p>
          <Building2 className="mt-2 h-4 w-4 text-slate-400" />
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Active Users</p>
          <p className="mt-2 text-2xl font-semibold [font-family:var(--font-heading)]">{overview?.totals.users ?? 0}</p>
          <Users className="mt-2 h-4 w-4 text-slate-400" />
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Connected Integrations</p>
          <p className="mt-2 text-2xl font-semibold [font-family:var(--font-heading)]">{overview?.totals.connectedIntegrations ?? 0}</p>
          <Link2 className="mt-2 h-4 w-4 text-slate-400" />
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Blog Posts</p>
          <p className="mt-2 text-2xl font-semibold [font-family:var(--font-heading)]">{totalPosts.total}</p>
          <p className="mt-1 text-xs text-slate-500">{totalPosts.published} published · {totalPosts.draft} draft</p>
        </div>
      </section>

      <section className="card p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">{isEditing ? 'Edit Blog Post' : 'Create Blog Post'}</h2>
          <button
            className="btn-secondary px-3 py-2 text-xs"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
            }}
          >
            Reset
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="input" placeholder="Author name" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} required />
          <input className="input md:col-span-2" placeholder="Summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required />
          <textarea className="input min-h-36 md:col-span-2" placeholder="Article content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
          <input className="input" placeholder="Company name (optional)" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <input className="input" placeholder="Resource URL (optional)" value={form.resourceUrl} onChange={(e) => setForm({ ...form, resourceUrl: e.target.value })} />
          <input className="input" placeholder="Cover image URL (optional)" value={form.coverImageUrl} onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} />
          <input
            className="input"
            placeholder="Tags (comma separated)"
            value={(form.tags || []).join(', ')}
            onChange={(e) => setForm({
              ...form,
              tags: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
            })}
          />
          <select
            className="input"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>

          <button disabled={saving} type="submit" className="btn-primary md:col-span-2 px-4 py-2.5 text-sm">
            <Plus className="h-4 w-4" />
            {saving ? 'Saving...' : isEditing ? 'Update Article' : 'Create Article'}
          </button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">Articles</h2>
          <FileText className="h-4 w-4 text-slate-400" />
        </div>

        <div className="divide-y divide-slate-100">
          {(posts || []).map((post) => (
            <div key={post.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-slate-900">{post.title}</p>
                <p className="text-xs text-slate-500">
                  {post.author_name} {post.company_name ? `· ${post.company_name}` : ''} · {post.status}
                  {post.published_at ? ` · ${format(parseISO(post.published_at), 'MMM d, yyyy')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary px-3 py-2 text-xs" onClick={() => startEdit(post)}>
                  <BarChart3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button className="btn-secondary px-3 py-2 text-xs" onClick={() => removePost(post.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
          {!posts?.length && <p className="px-5 py-8 text-sm text-slate-500">No articles yet.</p>}
        </div>
      </section>
    </div>
  );
}

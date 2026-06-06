"use client";

import { useState } from "react";

type Entry = { id: string; date: Date; description: string; amount: number };

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  profile: { firstName: string; lastName: string };
  fundraising: Entry[];
  expenses: Entry[];
};

export function StudentActivityList({ students }: { students: Student[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  const grades = Array.from(
    new Set(students.map((s) => s.grade).filter(Boolean) as string[])
  ).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const filtered = students.filter((s) => {
    const matchesSearch =
      !query.trim() ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(query.toLowerCase()) ||
      `${s.profile.firstName} ${s.profile.lastName}`.toLowerCase().includes(query.toLowerCase());
    const matchesGrade = !gradeFilter || s.grade === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (students.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">No students yet.</p>;
  }

  return (
    <div>
      {/* Column headers + search */}
      <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-2">
        <div className="grid grid-cols-5 gap-2 flex-1 text-xs font-medium uppercase tracking-wide text-slate-500 pl-7">
          <span>Student</span>
          <span>Parent</span>
          <span>Fundraising</span>
          <span>Expenses</span>
          <span>Balance</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student or parent…"
            className="w-52 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">No students match your search or filter.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {filtered.map((s) => {
        const raised = s.fundraising.reduce((sum, e) => sum + e.amount, 0);
        const spent = s.expenses.reduce((sum, e) => sum + e.amount, 0);
        const balance = raised - spent;
        const isOpen = expanded.has(s.id);

        return (
          <div key={s.id}>
            {/* Summary row — click to expand */}
            <button
              onClick={() => toggle(s.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition"
            >
              {/* Chevron */}
              <svg
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>

              <span className="flex-1 grid grid-cols-5 gap-2 text-sm">
                <span className="col-span-1 font-medium text-slate-100">
                  {s.firstName} {s.lastName}
                  {s.grade && (
                    <span className="ml-2 text-xs text-slate-500">Gr. {s.grade}</span>
                  )}
                </span>
                <span className="col-span-1 text-slate-400 text-xs self-center">
                  {s.profile.firstName} {s.profile.lastName}
                </span>
                <span className="col-span-1 text-emerald-400 text-xs self-center">
                  ↑ ${raised.toFixed(2)}
                </span>
                <span className="col-span-1 text-rose-400 text-xs self-center">
                  ↓ ${spent.toFixed(2)}
                </span>
                <span
                  className={`col-span-1 text-xs font-semibold self-center ${
                    balance >= 0 ? "text-cyan-400" : "text-amber-400"
                  }`}
                >
                  = ${balance.toFixed(2)}
                </span>
              </span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="bg-slate-950/50 px-8 pb-4 space-y-4">
                {/* Fundraising */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 mt-3">
                    Fundraising ({s.fundraising.length})
                  </p>
                  {s.fundraising.length === 0 ? (
                    <p className="text-xs text-slate-600 italic">No entries.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-800">
                          <th className="pb-1 pr-4">Date</th>
                          <th className="pb-1 pr-4">Description</th>
                          <th className="pb-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {s.fundraising.map((e) => (
                          <tr key={e.id}>
                            <td className="py-1 pr-4 text-slate-400 whitespace-nowrap">
                              {new Date(e.date).toLocaleDateString()}
                            </td>
                            <td className="py-1 pr-4 text-slate-300">{e.description}</td>
                            <td className="py-1 text-right font-medium text-emerald-400">
                              ${e.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Expenses */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Expenses ({s.expenses.length})
                  </p>
                  {s.expenses.length === 0 ? (
                    <p className="text-xs text-slate-600 italic">No entries.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-800">
                          <th className="pb-1 pr-4">Date</th>
                          <th className="pb-1 pr-4">Description</th>
                          <th className="pb-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {s.expenses.map((e) => (
                          <tr key={e.id}>
                            <td className="py-1 pr-4 text-slate-400 whitespace-nowrap">
                              {new Date(e.date).toLocaleDateString()}
                            </td>
                            <td className="py-1 pr-4 text-slate-300">{e.description}</td>
                            <td className="py-1 text-right font-medium text-rose-400">
                              ${e.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        );
          })}
        </div>
      )}
    </div>
  );
}

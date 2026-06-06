import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StudentForm } from "@/components/student-form";
import { deleteStudent } from "@/app/actions";

export default async function StudentsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const profile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      students: {
        include: {
          _count: { select: { fundraising: true, expenses: true } },
        },
        orderBy: { firstName: "asc" },
      },
    },
  });

  if (!profile) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">My Students</h2>
        <p className="text-sm text-slate-400">Your profile could not be loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">My Students</h2>
          <p className="text-sm text-slate-400">Manage the students linked to your account.</p>
        </div>
      </div>

      <StudentForm />

      {profile.students.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
          No students added yet. Use the form above to add your first student.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Fundraising</th>
                <th className="px-4 py-3">Expenses</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {profile.students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-medium text-slate-100">
                    <Link
                      href={`/students/${student.id}`}
                      className="text-cyan-400 hover:text-cyan-300 hover:underline transition"
                    >
                      {student.firstName} {student.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{student.grade ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{student._count.fundraising} entries</td>
                  <td className="px-4 py-3 text-slate-300">{student._count.expenses} entries</td>
                  <td className="px-4 py-3 text-right">
                    <form
                      action={async () => {
                        "use server";
                        await deleteStudent(student.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs text-rose-400 hover:text-rose-300 transition"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

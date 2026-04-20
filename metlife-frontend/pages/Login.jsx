import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <section className="relative hidden w-1/2 overflow-hidden bg-gradient-to-b from-[#2f21c7] to-[#2a1bb3] p-10 text-white lg:flex lg:flex-col lg:items-center lg:justify-center">
          <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute -right-16 bottom-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

          <div className="relative w-full max-w-[420px] rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-sm">
            <div className="mx-auto mb-4 h-40 w-40 rounded-full bg-white/15 p-6">
              <div className="h-full w-full rounded-full border border-white/40 bg-white/10" />
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-semibold">At Lead Nurturing</h2>
              <p className="text-sm text-indigo-100">
                protecting your information is a top priority
              </p>
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col bg-white px-5 py-8 sm:px-10 lg:w-1/2 lg:px-16">
          <header className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-lg font-bold text-indigo-700">
              LN
            </div>
            <div>
              <h1 className="text-xl font-bold text-indigo-700">Lead Nurturing</h1>
              <p className="text-xs text-gray-500">Your Intelligence Platform</p>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[470px] flex-1 flex-col justify-center">
            <h3 className="mb-2 text-3xl font-semibold text-gray-900">
              Log in to <span className="text-indigo-700">Lead Nurturing</span>
            </h3>
            <p className="mb-8 text-sm text-gray-500">
              Enter your credentials to continue to your dashboard.
            </p>

            <label className="mb-2 text-sm font-medium text-gray-600">Email</label>
            <input
              type="email"
              placeholder="Enter Email"
              className="mb-4 h-12 w-full rounded-full border border-gray-200 px-5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <label className="mb-2 text-sm font-medium text-gray-600">Password</label>
            <input
              type="password"
              placeholder="Your Password"
              className="mb-6 h-12 w-full rounded-full border border-gray-200 px-5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="h-12 w-full rounded-full bg-[#3326c7] text-sm font-semibold text-white transition hover:bg-[#291fb0]"
            >
              Login Now →
            </button>

            <p className="mt-8 text-center text-sm text-gray-500">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="font-medium text-indigo-700 hover:underline"
              >
                Sign up
              </button>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo_blue.png";
import { api } from "../services/api";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      const { updatedUser } = res.data.data;
      const token =
        res.headers["set-cookie"]?.[0]?.match(/accessToken=([^;]+)/)?.[1] ||
        res.data.data.accessToken;
      if (token) localStorage.setItem("accessToken", token);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      localStorage.setItem("isLoggedIn", "true");
      navigate("/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };
   
 
 

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-slate-900/50 p-10">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={logo} alt="logo" className="h-14 object-contain" />
        </div>

        <h2 className="text-xl font-semibold text-center text-gray-700 dark:text-gray-200 mb-6">
          Sign in to your account
        </h2>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          <div>
            <label
              className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;

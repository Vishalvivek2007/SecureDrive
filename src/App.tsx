import React, { useState, useEffect } from 'react';
import { signUp, confirmUser, signIn, getCurrentToken, signOut } from './auth';
import { Upload, Download, Share2, LogOut, FileText, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

interface FileItem {
  PK: string;
  SK: string;
  filename: string;
  size_bytes: number;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [authStep, setAuthStep] = useState<'login' | 'signup' | 'confirm'>('login');
  const [files, setFiles] = useState<{ owned: FileItem[]; sharedWithMe: FileItem[] }>({ owned: [], sharedWithMe: [] });
  const [status, setStatus] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [activeShareId, setActiveShareId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentToken().then((t) => {
      if (t) {
        setToken(t);
        fetchFiles(t);
      }
    });
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('');
    try {
      if (authStep === 'signup') {
        await signUp(email, password);
        setAuthStep('confirm');
        setStatus('Verification code sent to your email.');
      } else if (authStep === 'confirm') {
        await confirmUser(email, code);
        setAuthStep('login');
        setStatus('Email confirmed. Please log in.');
      } else {
        const jwt = await signIn(email, password);
        setToken(jwt);
        fetchFiles(jwt);
      }
    } catch (err: any) {
      setStatus(err.message || 'Authentication failed');
    }
  };

  const fetchFiles = async (jwt: string) => {
    try {
      const res = await fetch(`${API_URL}/files`, {
        headers: { Authorization: jwt }
      });
      const data = await res.json();
      setFiles({
        owned: data.owned || [],
        sharedWithMe: data.sharedWithMe || []
      });
    } catch {
      setStatus('Failed to fetch files');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setStatus('Requesting upload link...');
    try {
      const initRes = await fetch(`${API_URL}/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          filename: file.name, 
          contentType: file.type || 'application/octet-stream' 
        })
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`API Gateway error: ${errText}`);
      }

      const { uploadUrl } = await initRes.json();

      setStatus('Uploading directly to S3...');
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });

      if (!s3Res.ok) {
        const s3Err = await s3Res.text();
        throw new Error(`S3 Error (${s3Res.status}): ${s3Err}`);
      }

      setStatus('Upload complete. Processing file...');
      setTimeout(() => fetchFiles(token), 3000);
    } catch (err: any) {
      console.error(err);
      setStatus(err.message || 'Upload error');
    }
  };

  const handleDownload = async (fileId: string, owner?: string) => {
    if (!token) return;
    setStatus('Fetching download link...');
    try {
      const query = owner ? `?owner=${owner}` : '';
      const res = await fetch(`${API_URL}/files/${fileId}/download${query}`, {
        headers: { Authorization: token }
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Download failed (${res.status}): ${err}`);
      }

      const { downloadUrl, filename } = await res.json();

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('Download started.');
    } catch (err: any) {
      console.error(err);
      setStatus(err.message || 'Failed to get download URL');
    }
  };

  const handleShare = async (fileId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/files/${fileId}/share`, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetEmail: shareEmail, mode: 'account' })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`Shared successfully with ${shareEmail}`);
        setActiveShareId(null);
        setShareEmail('');
      } else {
        setStatus(data.error || 'Sharing failed');
      }
    } catch {
      setStatus('Sharing error');
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
          <h1 className="text-xl font-semibold mb-1 text-white tracking-tight">SecureDrive</h1>
          <p className="text-sm text-zinc-400 mb-6">Zero-knowledge, high-integrity cloud storage.</p>

          <form onSubmit={handleAuth} className="space-y-3">
            <div>
              <input
                type="email"
                placeholder="Email address"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {authStep !== 'confirm' && (
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}
            {authStep === 'confirm' && (
              <div>
                <input
                  type="text"
                  placeholder="Verification code"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-500"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 bg-white text-black font-medium text-sm rounded-lg hover:bg-zinc-200 transition cursor-pointer"
            >
              {authStep === 'login' && 'Sign In'}
              {authStep === 'signup' && 'Create Account'}
              {authStep === 'confirm' && 'Verify Code'}
            </button>
          </form>

          {status && <p className="mt-4 text-xs text-zinc-400 text-center">{status}</p>}

          <div className="mt-6 text-center">
            {authStep === 'login' ? (
              <button onClick={() => setAuthStep('signup')} className="text-xs text-zinc-400 hover:text-white cursor-pointer">
                Need an account? Sign up
              </button>
            ) : (
              <button onClick={() => setAuthStep('login')} className="text-xs text-zinc-400 hover:text-white cursor-pointer">
                Already registered? Sign in
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">SecureDrive</h1>
          <p className="text-xs text-zinc-400">Authenticated Session</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer bg-white text-black text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-200 flex items-center gap-1.5">
            <Upload size={14} /> Upload
            <input type="file" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => { signOut(); setToken(null); }}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg border border-zinc-800 cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {status && (
        <div className="mb-6 p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 flex items-center gap-2">
          <AlertCircle size={14} /> {status}
        </div>
      )}

      <section className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Your Files</h2>
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50">
            {files.owned.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">No files uploaded yet.</div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {files.owned.map((file) => {
                  const fileId = file.SK.replace('FILE#', '');
                  return (
                    <div key={file.SK} className="p-3.5 flex items-center justify-between text-sm hover:bg-zinc-800/30">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-zinc-400" />
                        <div>
                          <p className="text-zinc-200 text-xs font-medium">{file.filename}</p>
                          <p className="text-[10px] text-zinc-500">{(file.size_bytes / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(fileId)}
                          className="p-1.5 text-zinc-400 hover:text-white rounded cursor-pointer"
                        >
                          <Download size={15} />
                        </button>
                        <button
                          onClick={() => setActiveShareId(activeShareId === fileId ? null : fileId)}
                          className="p-1.5 text-zinc-400 hover:text-white rounded cursor-pointer"
                        >
                          <Share2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {activeShareId && (
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <h3 className="text-xs font-medium text-white">Share file with user email</h3>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="recipient@example.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none"
              />
              <button
                onClick={() => handleShare(activeShareId)}
                className="px-3 py-1.5 bg-zinc-100 text-black text-xs font-medium rounded-lg hover:bg-zinc-300 cursor-pointer"
              >
                Grant Access
              </button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Shared With You</h2>
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50">
            {files.sharedWithMe.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">No incoming shares.</div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {files.sharedWithMe.map((file) => {
                  const fileId = file.SK.replace('FILE#', '');
                  const ownerSub = file.PK.replace('USER#', '');
                  return (
                    <div key={file.SK} className="p-3.5 flex items-center justify-between text-sm hover:bg-zinc-800/30">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-zinc-400" />
                        <div>
                          <p className="text-zinc-200 text-xs font-medium">{file.filename}</p>
                          <p className="text-[10px] text-zinc-500">Shared by {ownerSub.slice(0, 8)}...</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(fileId, ownerSub)}
                        className="p-1.5 text-zinc-400 hover:text-white rounded cursor-pointer"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
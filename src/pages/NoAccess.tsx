import { useAuth } from "../AuthContext";

export default function NoAccess() {
  const { firebaseUser, signOutUser } = useAuth();
  return (
    <div className="centered-page">
      <div className="card">
        <h1>No access</h1>
        <p className="muted">
          Signed in as <strong>{firebaseUser?.email}</strong>, but there's no active account record for
          you in the system. Ask a manager to set one up in Firestore (<code>users</code> collection).
        </p>
        <button onClick={() => signOutUser()}>Sign out</button>
      </div>
    </div>
  );
}

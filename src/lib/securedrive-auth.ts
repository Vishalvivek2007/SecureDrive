import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from "amazon-cognito-identity-js";

const userPool = new CognitoUserPool({
  UserPoolId:
    (import.meta.env["VITE_USER_POOL_ID"] as string | undefined) ??
    "ap-southeast-2_riqKiL6al",
  ClientId:
    (import.meta.env["VITE_CLIENT_ID"] as string | undefined) ??
    "5lllj8ifvsf92u3ddbs2ql6497",
});

export const signUp = (email: string, password: string): Promise<CognitoUser | undefined> =>
  new Promise((resolve, reject) => {
    userPool.signUp(email, password, [], [], (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result?.user);
    });
  });

export const confirmUser = (email: string, code: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });

export const signIn = (email: string, password: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const details = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(details, {
      onSuccess: (session) => resolve(session.getIdToken().getJwtToken()),
      onFailure: reject,
    });
  });

export const getCurrentToken = (): Promise<string | null> =>
  new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession((error: Error | null, session: { isValid: () => boolean; getIdToken: () => { getJwtToken: () => string } }) => {
      if (error || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });

export const signOut = () => userPool.getCurrentUser()?.signOut();
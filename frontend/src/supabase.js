// Заглушка — Supabase подключим позже
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { email: "trader@pump.com" } } }),
    onAuthStateChange: (cb) => {
      setTimeout(() => cb("SIGNED_IN", { user: { email: "trader@pump.com" } }), 0)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signOut: async () => {}
  }
}

export const signUp  = async () => ({})
export const signIn  = async () => ({})
export const signOut = async () => {}

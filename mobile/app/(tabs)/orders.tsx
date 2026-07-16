import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "../../lib/auth"
import MyOrders from "../../components/MyOrders"
import Feed from "../../components/Feed"

export default function Orders() {
  const { role } = useAuth()

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {role === "driver" ? <Feed /> : <MyOrders />}
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
}

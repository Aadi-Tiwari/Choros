import { ChatInterface } from "@/components/chat-interface"
import { PageBackground } from "@/components/page-background"

export default function Home() {
  return (
    <div className="relative isolate min-h-screen bg-black">
      <PageBackground />
      <div className="relative z-10"><ChatInterface /></div>
    </div>
  )
}

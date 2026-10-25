// Tofu changed this file on 2026-10-25 (TOFU.md says why): a visitor who is not signed in is sent to the sign-in page;
// the page sends people to the public channel only once the channels have loaded and the one asked for is not among
// them, rather than before they load; and a viewer, who can read but not post, is told so instead of being offered
// a message box.
import Layout from '~/components/Layout'
import Message from '~/components/Message'
import MessageInput from '~/components/MessageInput'
import { useRouter } from 'next/router'
import { useStore, addMessage } from '~/lib/Store'
import { useContext, useEffect, useRef } from 'react'
import UserContext from '~/lib/UserContext'

const ChannelsPage = (props) => {
  const router = useRouter()
  const { user, authChecked, signOut } = useContext(UserContext)
  const messagesEndRef = useRef(null)

  // Else load up the page
  const { id: channelId } = router.query
  const { messages, channels } = useStore({ channelId })

  // send a visitor who is not signed in to the sign-in page
  useEffect(() => {
    if (authChecked && !user) router.push('/')
  }, [authChecked, user])

  useEffect(() => {
    messagesEndRef.current.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    })
  }, [messages])

  // redirect to public channel when current channel is deleted
  useEffect(() => {
    if (channels.length > 0 && !channels.some((channel) => channel.id === Number(channelId))) {
      router.push('/channels/1')
    }
  }, [channels, channelId])

  // Render the channels and messages
  return (
    <Layout channels={channels} activeChannelId={channelId}>
      <div className="relative h-screen">
        <div className="Messages h-full pb-16">
          <div className="p-2 overflow-y-auto">
            {messages.map((x) => (
              <Message key={x.id} message={x} />
            ))}
            <div ref={messagesEndRef} style={{ height: 0 }} />
          </div>
        </div>
        <div className="p-2 absolute bottom-0 left-0 w-full">
          {user?.appRole === 'viewer' ? (
            <p className="text-gray-300 text-sm py-2 px-3">
              You can read this chat but not post in it. Ask its owner if you should be able to.
            </p>
          ) : (
            <MessageInput onSubmit={async (text) => addMessage(text, channelId, user.id)} />
          )}
        </div>
      </div>
    </Layout>
  )
}

export default ChannelsPage

// src/components/LiveChat.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  X, 
  Send, 
  Clock, 
  User, 
  Bot,
  Loader2 
} from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: Date;
}

const LiveChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Welcome to Vura Support! How can I help you today?',
      sender: 'agent',
      timestamp: new Date()
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const sendMessage = async () => {
    if (!newMessage.trim() || isTyping) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: newMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);

    // Simulate agent typing
    setTimeout(() => {
      setIsTyping(false);
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: getAgentResponse(newMessage),
        sender: 'agent',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, agentMessage]);
    }, 2000);
  };

  const getAgentResponse = (userMessage: string): string => {
    const msg = userMessage.toLowerCase();
    
    if (msg.includes('help') || msg.includes('support')) {
      return "I'm here to help! You can ask me about account issues, transactions, security, or general banking questions.";
    }
    
    if (msg.includes('transaction') || msg.includes('transfer')) {
      return "For transaction issues, please provide the transaction reference number. You can find this in your transaction history.";
    }
    
    if (msg.includes('forgot') || msg.includes('password') || msg.includes('pin')) {
      return "For security reasons, we cannot reset your PIN or password through chat. Please visit our security page or call our hotline at 0800-VURA.";
    }
    
    if (msg.includes('fraud') || msg.includes('scam') || msg.includes('unauthorized')) {
      return "I understand your concern. For security issues, please immediately call our fraud hotline at 0800-FRAUD. Your account security is our top priority.";
    }
    
    if (msg.includes('thank')) {
      return "You're welcome! Is there anything else I can help you with today?";
    }
    
    return "Thank you for your message. A support agent will respond shortly. In the meantime, you can also check our FAQ section for quick answers.";
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    // Simulate agent going online/offline
    const interval = setInterval(() => {
      setIsOnline(Math.random() > 0.3);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Chat Toggle Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-primary text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 z-50 group"
          aria-label="Open live chat"
        >
          <MessageCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
          {!isOnline && (
            <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-xl shadow-2xl border border-border z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary to-primary/90 text-white rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bot className="h-6 w-6" />
                {isOnline && (
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white"></div>
                )}
              </div>
              <div>
                <h3 className="font-semibold">Live Support</h3>
                <p className="text-xs opacity-80">AI Assistant</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4 space-y-3">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] p-3 rounded-2xl ${
                    message.sender === 'user' 
                      ? 'bg-primary text-white' 
                      : message.sender === 'agent'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {message.sender === 'user' && <User className="h-4 w-4" />}
                    {message.sender === 'agent' && <Bot className="h-4 w-4" />}
                    <span className="text-xs opacity-75">{formatTime(message.timestamp)}</span>
                  </div>
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span className="text-xs opacity-75">{formatTime(new Date())}</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-border">
            {!isOnline && (
              <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Our agents are currently offline. Messages will be responded to during business hours.
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={isOnline ? "Type your message..." : "Leave a message for our team..."}
                className="flex-1 rounded-xl"
                disabled={!isOnline && messages.length > 5}
              />
              <Button 
                onClick={sendMessage} 
                disabled={!newMessage.trim() || isTyping}
                className="rounded-xl"
              >
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            
            <div className="mt-2 text-xs text-muted-foreground text-center">
              {isOnline ? "We're online and ready to help" : "Agents offline - messages will be responded to during business hours"}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LiveChat;

import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  TrendingUp,
  Users,
  Zap,
  Calendar,
  Target,
  Award,
  Bell,
  Settings,
  Clock,
  Activity,
  BookMarked
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ProfileDropdown } from "@/components/ProfileDropdown"
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts'

const ItemGenerator = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("2024")

  const stats = [
    {
      label: "Total Tokens Used",
      value: "46,100",
      change: "+12%",
      icon: Zap,
      gradient: "from-blue-500 to-purple-600",
      bgColor: "bg-blue-50",
      textColor: "text-blue-700"
    },
    {
      label: "Today's Usage",
      value: "2,238",
      subLabel: "Balance: 7,762 remaining",
      change: "+5%",
      icon: Activity,
      gradient: "from-green-500 to-teal-600",
      bgColor: "bg-green-50",
      textColor: "text-green-700"
    },
    {
      label: "Questions Generated",
      value: "65",
      change: "+23%",
      subStats: [
        { label: "Multiple Choice", value: "64", color: "text-orange-600" },
        { label: "Written Response", value: "1", color: "text-blue-600" }
      ],
      icon: Target,
      gradient: "from-orange-500 to-red-600",
      bgColor: "bg-orange-50",
      textColor: "text-orange-700"
    },
    {
      label: "Questions Saved",
      value: "28",
      change: "+8%",
      subStats: [
        { label: "Multiple Choice", value: "27", color: "text-purple-600" },
        { label: "Written Response", value: "1", color: "text-pink-600" }
      ],
      icon: BookMarked,
      gradient: "from-purple-500 to-pink-600",
      bgColor: "bg-purple-50",
      textColor: "text-purple-700"
    }
  ]

  const chartData = [
    { name: 'Mon', usage: 1200, questions: 8 },
    { name: 'Tue', usage: 1900, questions: 12 },
    { name: 'Wed', usage: 1500, questions: 10 },
    { name: 'Thu', usage: 2800, questions: 18 },
    { name: 'Fri', usage: 2238, questions: 15 },
    { name: 'Sat', usage: 1800, questions: 11 },
    { name: 'Sun', usage: 2100, questions: 14 },
  ]

  const weeklyData = [
    { day: 'Week 1', generated: 42, saved: 18 },
    { day: 'Week 2', generated: 38, saved: 22 },
    { day: 'Week 3', generated: 45, saved: 28 },
    { day: 'Week 4', generated: 52, saved: 31 },
  ]

  const books = [
    {
      year: "2024",
      title: "Cyber Risk",
      subtitle: "Chartered Insurance Professional",
      code: "C20",
      questions: 11,
      cover: "/lovable-uploads/a13547e7-af5f-49b0-bb15-9b344d6cd72e.png"
    },
    {
      year: "2023",
      title: "Principles and Practice of Insurance",
      subtitle: "Chartered Insurance Professional",
      code: "C11",
      questions: 17,
      cover: "/lovable-uploads/a13547e7-af5f-49b0-bb15-9b344d6cd72e.png"
    }
  ]

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-muted/10 to-background">
      {/* Header 1 */}
      <header className="sticky top-0 z-50 glass-effect border-b border-border/30">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/">
                <Button variant="ghost" size="icon" className="hover:scale-110 transition-transform duration-200">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="h-6 w-px bg-border/40" />
              <h1 className="text-xl font-semibold text-foreground">Item Generator</h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Welcome Back,</span>
                <span className="font-semibold text-primary">Shivaraj Mi</span>
              </div>
              <Button variant="ghost" size="icon" className="hover:scale-110 transition-transform duration-200">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:scale-110 transition-transform duration-200">
                <Settings className="h-5 w-5" />
              </Button>
              <ProfileDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Bento Grid Layout */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-12 gap-6 h-full">

          {/* Generated Books Section */}
          <div className="col-span-12 lg:col-span-4">
            <Card className="h-full bg-white/90 backdrop-blur-sm border border-border/30 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <BookOpen className="h-6 w-6 text-primary" />
                  Generated Books
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {books.map((book, index) => (
                  <Link key={index} to={`/question-generator/${book.code.toLowerCase()}`}>
                    <Card className="group p-4 bg-white/95 backdrop-blur-sm border border-border/30 hover:shadow-lg hover-glow transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-16 bg-gradient-to-br from-primary/30 to-primary/10 rounded-lg flex items-center justify-center text-xs font-bold text-primary border border-primary/30">
                          {book.code}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Badge variant="secondary" className="mb-2 text-xs">
                            {book.year}
                          </Badge>
                          <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors leading-tight">
                            {book.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                            {book.subtitle}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-primary">
                              {book.questions} Questions
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Statistics Grid */}
          <div className="col-span-12 lg:col-span-8 space-y-6">

            {/* Key Metrics - Bento Style */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <Card
                  key={index}
                  className={`group bg-white/90 backdrop-blur-sm border border-border/30 shadow-xl hover:shadow-2xl hover-glow transition-all duration-500 hover:-translate-y-1 relative overflow-hidden`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className={`w-full h-full bg-gradient-to-br ${stat.gradient}`} />
                  </div>

                  <CardContent className="p-4 relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${stat.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                        <stat.icon className="h-5 w-5 text-white" />
                      </div>
                      {stat.change && (
                        <Badge variant="secondary" className="text-xs text-green-600 bg-green-50">
                          {stat.change}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className={`text-2xl font-bold ${stat.textColor} group-hover:scale-105 transition-transform duration-300`}>
                        {stat.value}
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {stat.label}
                      </p>

                      {stat.subLabel && (
                        <p className="text-xs text-muted-foreground">
                          {stat.subLabel}
                        </p>
                      )}

                      {stat.subStats && (
                        <div className="space-y-1 mt-3">
                          {stat.subStats.map((subStat, subIndex) => (
                            <div key={subIndex} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{subStat.label}</span>
                              <span className={`font-bold ${subStat.color}`}>{subStat.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Daily Usage Trend */}
              <Card className="bg-white/90 backdrop-blur-sm border border-border/30 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Daily Usage Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(215 55% 40%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(215 55% 40%)" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="name"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <Area
                          type="monotone"
                          dataKey="usage"
                          stroke="hsl(215 55% 40%)"
                          strokeWidth={3}
                          fill="url(#usageGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Weekly Progress */}
              <Card className="bg-white/90 backdrop-blur-sm border border-border/30 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Weekly Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData} barGap={8}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="day"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <Bar
                          dataKey="generated"
                          fill="hsl(215 55% 40%)"
                          radius={[4, 4, 0, 0]}
                          name="Generated"
                        />
                        <Bar
                          dataKey="saved"
                          fill="hsl(142 76% 36%)"
                          radius={[4, 4, 0, 0]}
                          name="Saved"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card className="bg-white/90 backdrop-blur-sm border border-border/30 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-primary" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Generated 5 new questions for Cyber Risk</p>
                      <p className="text-xs text-muted-foreground">2 minutes ago</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">New</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Exported question set C20</p>
                      <p className="text-xs text-muted-foreground">15 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Saved 3 questions to collection</p>
                      <p className="text-xs text-muted-foreground">1 hour ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ItemGenerator

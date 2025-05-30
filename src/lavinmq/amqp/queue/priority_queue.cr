require "./durable_queue"

module LavinMQ::AMQP
  class PriorityQueue < Queue
    private def handle_arguments
      super
      @effective_args << "x-max-priority"
    end

    private def init_msg_store(data_dir)
      replicator = durable? ? @vhost.@replicator : nil
      PriorityMessageStore.new(data_dir, replicator, metadata: @metadata)
    end

    class PriorityMessageStore < MessageStore
      # def initialize(@data_dir : String, metadata : ::Log::Metadata, @replicator : Clustering::Replicator?)
      def initialize(*args, **kwargs)
        super
        order_messages
      end

      def order_messages
        sps = Array(SegmentPosition).new(@size)
        while env = shift?
          sps << env.segment_position
        end
        sps.each { |sp| requeue sp }
      end

      def push(msg) : SegmentPosition
        sp = super
        # make sure that we don't read from disk, only from requeued
        @rfile_id = @wfile_id
        @rfile = @wfile
        @rfile.seek(0, IO::Seek::End)
        # order messages by priority in the requeue dequeue
        if idx = @requeued.bsearch_index { |rsp| rsp.priority < sp.priority }
          @requeued.insert(idx, sp)
        else
          @requeued.push(sp)
        end
        sp
      end

      def requeue(sp : SegmentPosition)
        if idx = @requeued.bsearch_index { |rsp| rsp.priority < sp.priority }
          @requeued.insert(idx, sp)
        else
          @requeued.push(sp)
        end
        was_empty = @size.zero?
        @bytesize += sp.bytesize
        @size += 1
        @empty.set false if was_empty
      end
    end
  end

  class DurablePriorityQueue < PriorityQueue
    def durable?
      true
    end
  end
end
